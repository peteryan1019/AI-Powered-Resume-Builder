terraform {
  required_version = ">= 1.10, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.0"
    }
  }

  # State is local initially to keep setup and monthly cost low. It is ignored
  # by Git. Back it up securely after every apply; losing it makes Terraform
  # forget which AWS resources it owns. Move to a versioned S3 backend before
  # adding another operator or running Terraform from GitHub Actions.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "resumebuilder"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Helm authenticates to the new cluster using the caller's short-lived AWS
# credentials. No static Kubernetes token or kubeconfig is stored in state.
provider "helm" {
  kubernetes = {
    host                   = aws_eks_cluster.this.endpoint
    cluster_ca_certificate = base64decode(aws_eks_cluster.this.certificate_authority[0].data)

    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", aws_eks_cluster.this.name, "--region", var.aws_region]
    }
  }
}
