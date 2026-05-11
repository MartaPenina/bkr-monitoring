resource "aws_db_subnet_group" "main" {
  count = var.config.general.cloud == "aws" ? 1 : 0
  name  = "coinops-db-subnet-group"

  subnet_ids = [
    var.private_subnet_id,
    var.private_subnet_b_id,
    "subnet-01886c757ce10dbd8"
  ]

  tags = {
    Name = "coinops-db-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  identifier     = "coinops-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "cognitor"
  username = "cognitor"
  password = var.config.general.db_password

  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [var.rds_sg_id]

  skip_final_snapshot = true
  publicly_accessible = false

  tags = {
    Name = "coinops-postgres"
  }
}