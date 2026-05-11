resource "aws_security_group" "alb" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  name        = "alb-sg"
  description = "Allow HTTP and HTTPS"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "main" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  name               = "coinops-alb"
  internal           = false
  load_balancer_type = "application"

  security_groups = [aws_security_group.alb[0].id]

  subnets = [
    var.public_subnet_id,
    var.public_subnet_b_id
  ]
}

resource "aws_lb_target_group" "ui" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  name     = "coinops-ui"
  port     = 80
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path = "/"
  }
}

resource "aws_lb_target_group_attachment" "ui" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  target_group_arn = aws_lb_target_group.ui[0].arn
  target_id        = var.ui_instance_id
  port             = 80
}

resource "aws_lb_listener" "http" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ui[0].arn
  }
}