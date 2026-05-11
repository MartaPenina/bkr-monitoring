output "alb_dns_name" {
  value = try(aws_lb.main[0].dns_name, null)
}

