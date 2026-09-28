output "aws_account_id" {
  description = "AWS account in which Terraform will create the stack. Check this before applying."
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS region containing the stack."
  value       = var.aws_region
}

output "cluster_name" {
  description = "EKS cluster name."
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint. Authentication is still required."
  value       = aws_eks_cluster.this.endpoint
}

output "vpc_id" {
  description = "Dedicated VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Two public subnets supplied to EKS and the public load balancer."
  value       = aws_subnet.public[*].id
}

output "worker_availability_zone" {
  description = "The single AZ used by the cost-minimized worker node group and EBS application volumes."
  value       = aws_subnet.public[0].availability_zone
}

output "certificate_arn" {
  description = "ACM certificate ARN to put into k8s/app production values."
  value       = aws_acm_certificate.app.arn
}

output "certificate_dns_validation_records" {
  description = "Create these CNAME records at Name.com. ACM will remain pending until they resolve."
  value = [
    for option in aws_acm_certificate.app.domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}

output "configure_kubectl_command" {
  description = "Run after apply to add this EKS cluster to your local kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.this.name}"
}

output "github_actions_deploy_role_arn" {
  description = "Short-lived AWS role assumed by the main-branch release workflow through GitHub OIDC."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "verify_cluster_commands" {
  description = "Read-only checks to run after kubeconfig is configured."
  value = [
    "kubectl get nodes -o wide",
    "kubectl get pods -A",
    "helm list -A",
  ]
}

output "cost_design" {
  description = "Cost-relevant choices deliberately made by this stack."
  value = {
    nat_gateway               = "none"
    worker_nodes_initial      = var.node_desired_size
    worker_nodes_maximum      = var.node_max_size
    worker_node_az_count      = 1
    database_and_redis        = "not created here; deployed in-cluster by k8s/data"
    application_load_balancer = "controller installed; ALB is created only when k8s/app Ingress is deployed"
  }
}
