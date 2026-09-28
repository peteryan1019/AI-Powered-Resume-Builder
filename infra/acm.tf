# ACM provides and automatically renews the public TLS certificate at no extra
# certificate charge. Name.com remains authoritative for DNS, so Terraform
# outputs the validation CNAME rather than attempting to edit DNS itself.
resource "aws_acm_certificate" "app" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = var.domain_name
  }
}
