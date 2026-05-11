resource "aws_security_group" "jump_host" {
  count       = var.config.general.cloud == "aws" ? 1 : 0
  name        = "jump-host-sg"
  description = "Allow SSH from internet on custom port"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = tonumber(var.config.general.ssh_port)
    to_port     = tonumber(var.config.general.ssh_port)
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "jump-host-sg"
  }
}

resource "aws_security_group" "internal" {
  count       = var.config.general.cloud == "aws" ? 1 : 0
  name        = "internal-sg"
  description = "Allow SSH from jump host and internal communication"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = tonumber(var.config.general.ssh_port)
    to_port         = tonumber(var.config.general.ssh_port)
    protocol        = "tcp"
    security_groups = [aws_security_group.jump_host[0].id]
  }

  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "internal-sg"
  }
}

resource "aws_security_group" "web" {
  count       = var.config.general.cloud == "aws" ? 1 : 0
  name        = "web-sg"
  description = "Allow HTTP/HTTPS from internet"
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

  tags = {
    Name = "web-sg"
  }
}

resource "aws_security_group" "rds" {
  count       = var.config.general.cloud == "aws" ? 1 : 0
  name        = "rds-sg"
  description = "Allow PostgreSQL from internal VMs"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.internal[0].id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "rds-sg"
  }
}
