locals {
  raw_config = yamldecode(file("${path.module}/config.yaml"))
  config = merge(local.raw_config, {
    general = merge(local.raw_config.general, {
      db_password = var.db_password
    })
  })
  general         = local.config.general
  cloud           = local.general.cloud
  location        = local.general.location
  active_location = local.config.locations[local.location][local.cloud]
}

# ── GCP modules (active when cloud = "gcp") ──────────────────────────────────
module "gcp_network" {
  count  = local.cloud == "gcp" ? 1 : 0
  source = "./modules/gcp_network"
  config = local.config
}

module "gcp_security" {
  count    = local.cloud == "gcp" ? 1 : 0
  source   = "./modules/gcp_security"
  config   = local.config
  vpc_name = module.gcp_network[0].vpc_name
}

module "gcp_vm" {
  count          = local.cloud == "gcp" ? 1 : 0
  source         = "./modules/gcp_vm"
  config         = local.config
  subnetwork     = module.gcp_network[0].subnet_id
  ssh_public_key = file("${pathexpand("~")}/.ssh/id_ed25519.pub")
}

# ── AWS modules (active when cloud = "aws") ───────────────────────────────────
module "aws_network" {
  count  = local.cloud == "aws" ? 1 : 0
  source = "./modules/aws_network"
  config = local.config
}

module "aws_security" {
  count  = local.cloud == "aws" ? 1 : 0
  source = "./modules/aws_security"
  config = local.config
  vpc_id = module.aws_network[0].vpc_id
}

module "aws_vm" {
  count             = local.cloud == "aws" ? 1 : 0
  source            = "./modules/aws_vm"
  config            = local.config
  ssh_public_key    = file("${pathexpand("~")}/.ssh/id_ed25519.pub")
  public_subnet_id  = module.aws_network[0].public_subnet_id
  private_subnet_id = module.aws_network[0].private_subnet_id
  jump_host_sg_id   = module.aws_security[0].jump_host_sg_id
  internal_sg_id    = module.aws_security[0].internal_sg_id
  web_sg_id         = module.aws_security[0].web_sg_id
}

module "aws_lb" {
  count              = local.cloud == "aws" ? 1 : 0
  source             = "./modules/aws_lb"
  config             = local.config
  vpc_id             = module.aws_network[0].vpc_id
  public_subnet_id   = module.aws_network[0].public_subnet_id
  public_subnet_b_id = module.aws_network[0].public_subnet_b_id
  ui_instance_id     = module.aws_vm[0].ui_instance_id
}

module "aws_rds" {
  count               = local.cloud == "aws" ? 1 : 0
  source              = "./modules/aws_rds"
  config              = local.config
  private_subnet_id   = module.aws_network[0].private_subnet_id
  private_subnet_b_id = module.aws_network[0].private_subnet_b_id
  rds_sg_id           = module.aws_security[0].rds_sg_id
}
