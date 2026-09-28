locals {
  github_repository = "UTSC-CSCC09-Programming-on-the-Web/project-resumebuilder"
  github_branch     = "main"
}

# GitHub exchanges a signed, short-lived identity token for temporary AWS
# credentials. There is no AWS access key to create, copy, rotate, or leak.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github_actions_deploy" {
  name                 = "${var.cluster_name}-github-actions-deploy"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${local.github_repository}:ref:refs/heads/${local.github_branch}"
        }
      }
    }]
  })
}

# IAM gets the workflow as far as the EKS API. Kubernetes permissions are
# granted separately by the namespace-scoped access policy below.
resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "describe-${var.cluster_name}-cluster"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "eks:DescribeCluster"
      Resource = aws_eks_cluster.this.arn
    }]
  })
}

resource "aws_eks_access_entry" "github_actions_deploy" {
  cluster_name      = aws_eks_cluster.this.name
  principal_arn     = aws_iam_role.github_actions_deploy.arn
  type              = "STANDARD"
  kubernetes_groups = ["resumebuilder-deployers"]
}

# The release workflow can administer application objects only inside the
# resumebuilder namespace. It cannot change kube-system, nodes, controllers,
# EKS access, or any other namespace.
resource "aws_eks_access_policy_association" "github_actions_deploy" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_actions_deploy.arn
  policy_arn    = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["resumebuilder"]
  }

  depends_on = [aws_eks_access_entry.github_actions_deploy]
}

# EKS's managed namespace-admin policy covers built-in Kubernetes resources,
# but intentionally does not grant access to arbitrary third-party custom
# resources. The app chart contains a KEDA ScaledObject, so give the workflow's
# Kubernetes group only the additional custom-resource permissions it needs.
# This bootstrap release is installed by Terraform using the cluster creator's
# credentials; the deployment workflow cannot grant permissions to itself.
resource "helm_release" "github_actions_namespace_rbac" {
  name             = "resumebuilder-github-actions-rbac"
  namespace        = "resumebuilder"
  create_namespace = true
  chart            = "${path.module}/../k8s/deploy-rbac"

  atomic  = true
  wait    = true
  timeout = 300

  values = [yamlencode({
    groupName = "resumebuilder-deployers"
  })]

  depends_on = [aws_eks_access_entry.github_actions_deploy]
}
