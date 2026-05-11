resource "aws_vpc" "main" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "devops-vpc"
  }
}

resource "aws_subnet" "public" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = var.config.locations[var.config.general.location].aws.zones.primary
  map_public_ip_on_launch = true

  tags = {
    Name = "devops-public-subnet"
  }
}

resource "aws_subnet" "public_b" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = "10.0.5.0/24"
  availability_zone       = var.config.locations[var.config.general.location].aws.zones.secondary
  map_public_ip_on_launch = true

  tags = {
    Name = "devops-public-subnet-b"
  }
}

resource "aws_subnet" "private" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  vpc_id            = aws_vpc.main[0].id
  cidr_block        = "10.0.2.0/24"
  availability_zone = var.config.locations[var.config.general.location].aws.zones.primary

  tags = {
    Name = "devops-private-subnet"
  }
}

resource "aws_subnet" "private_b" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  vpc_id            = aws_vpc.main[0].id
  cidr_block        = "10.0.4.0/24"
  availability_zone = var.config.locations[var.config.general.location].aws.zones.secondary

  tags = {
    Name = "devops-private-subnet-b"
  }
}

resource "aws_internet_gateway" "main" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  tags = {
    Name = "devops-igw"
  }
}

resource "aws_route_table" "public" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = {
    Name = "devops-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  subnet_id      = aws_subnet.public[0].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_route_table_association" "public_b" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  subnet_id      = aws_subnet.public_b[0].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_eip" "nat" {
  count  = var.config.general.cloud == "aws" ? 1 : 0
  domain = "vpc"

  tags = {
    Name = "devops-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "devops-nat-gw"
  }
}

resource "aws_route_table" "private" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[0].id
  }

  tags = {
    Name = "devops-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  subnet_id      = aws_subnet.private[0].id
  route_table_id = aws_route_table.private[0].id
}

resource "aws_route_table_association" "private_b" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  subnet_id      = aws_subnet.private_b[0].id
  route_table_id = aws_route_table.private[0].id
}