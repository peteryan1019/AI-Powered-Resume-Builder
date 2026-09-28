data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ec2_instance_type_offerings" "nodes" {
  location_type = "availability-zone"

  filter {
    name   = "instance-type"
    values = var.node_instance_types
  }
}

locals {
  project_name = "resumebuilder"

  # EKS requires subnets in at least two AZs. Nodes deliberately run only in
  # the first AZ to avoid paying for always-on duplicate capacity at launch.
  eligible_azs = sort(tolist(setintersection(
    toset(data.aws_availability_zones.available.names),
    toset(data.aws_ec2_instance_type_offerings.nodes.locations),
  )))
  cluster_azs = slice(local.eligible_azs, 0, 2)

  common_tags = {
    Project     = local.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

check "two_eligible_availability_zones" {
  assert {
    condition     = length(local.eligible_azs) >= 2
    error_message = "EKS needs at least two availability zones that offer the requested node instance types."
  }
}

check "valid_node_scaling_bounds" {
  assert {
    condition = (
      var.node_min_size >= 1 &&
      var.node_desired_size >= var.node_min_size &&
      var.node_desired_size <= var.node_max_size
    )
    error_message = "Node sizes must satisfy: 1 <= min_size <= desired_size <= max_size."
  }
}
