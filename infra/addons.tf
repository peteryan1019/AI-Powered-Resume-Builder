resource "aws_eks_pod_identity_association" "load_balancer_controller" {
  cluster_name    = aws_eks_cluster.this.name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.load_balancer_controller.arn

  depends_on = [
    aws_eks_addon.pod_identity_agent,
    aws_iam_role_policy_attachment.load_balancer_controller,
  ]
}

resource "aws_eks_pod_identity_association" "cluster_autoscaler" {
  cluster_name    = aws_eks_cluster.this.name
  namespace       = "kube-system"
  service_account = "cluster-autoscaler"
  role_arn        = aws_iam_role.cluster_autoscaler.arn

  depends_on = [
    aws_eks_addon.pod_identity_agent,
    aws_iam_role_policy_attachment.cluster_autoscaler,
  ]
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  namespace  = "kube-system"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.aws_load_balancer_controller_chart_version

  atomic  = true
  wait    = true
  timeout = 600

  values = [yamlencode({
    clusterName  = aws_eks_cluster.this.name
    region       = var.aws_region
    vpcId        = aws_vpc.this.id
    replicaCount = 1
    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
    }
  })]

  depends_on = [
    aws_eks_addon.vpc_cni,
    aws_eks_addon.coredns,
    aws_eks_pod_identity_association.load_balancer_controller,
  ]
}

resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  namespace  = "kube-system"
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  version    = var.cluster_autoscaler_chart_version

  atomic  = true
  wait    = true
  timeout = 600

  values = [yamlencode({
    autoDiscovery = {
      clusterName = aws_eks_cluster.this.name
    }
    awsRegion     = var.aws_region
    cloudProvider = "aws"
    replicaCount  = 1
    rbac = {
      serviceAccount = {
        create = true
        name   = "cluster-autoscaler"
      }
    }
  })]

  depends_on = [
    aws_autoscaling_group_tag.autoscaler_enabled,
    aws_autoscaling_group_tag.autoscaler_cluster,
    aws_eks_addon.coredns,
    aws_eks_pod_identity_association.cluster_autoscaler,
  ]
}

resource "helm_release" "keda" {
  name             = "keda"
  namespace        = "keda"
  create_namespace = true
  repository       = "https://kedacore.github.io/charts"
  chart            = "keda"
  version          = var.keda_chart_version

  atomic  = true
  wait    = true
  timeout = 600

  depends_on = [
    aws_eks_addon.coredns,
    aws_eks_node_group.workers,
  ]
}
