# BKR Monitoring — Terraform Root Module
# Reads config.yaml, provisions VMs on GCP or AWS.
# Switch cloud by changing `cloud` field in config.yaml.

locals {
  config  = yamldecode(file("${path.module}/config.yaml"))
  general = local.config.general
  is_gcp  = local.config.cloud == "gcp"
  is_aws  = local.config.cloud == "aws"
}

# ── GCP Network ─────────────────────────────────────────────────────────
resource "google_compute_network" "vpc" {
  count                   = local.is_gcp ? 1 : 0
  name                    = "bkr-monitoring-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  count         = local.is_gcp ? 1 : 0
  name          = "bkr-monitoring-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = local.general.region
  network       = google_compute_network.vpc[0].id
}

# ── GCP Firewall ────────────────────────────────────────────────────────
resource "google_compute_firewall" "allow_ssh_external" {
  count   = local.is_gcp ? 1 : 0
  name    = "bkr-allow-ssh-external"
  network = google_compute_network.vpc[0].name

  allow {
    protocol = "tcp"
    ports    = [local.general.ssh_port]
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["jump-host"]
}

resource "google_compute_firewall" "allow_ssh_internal" {
  count   = local.is_gcp ? 1 : 0
  name    = "bkr-allow-ssh-internal"
  network = google_compute_network.vpc[0].name

  allow {
    protocol = "tcp"
    ports    = [local.general.ssh_port]
  }
  source_tags = ["jump-host"]
  target_tags = ["internal"]
}

resource "google_compute_firewall" "allow_internal" {
  count   = local.is_gcp ? 1 : 0
  name    = "bkr-allow-internal"
  network = google_compute_network.vpc[0].name

  allow { protocol = "tcp" }
  allow { protocol = "udp" }
  allow { protocol = "icmp" }

  source_tags = ["internal"]
  target_tags = ["internal"]
}

# ── GCP VMs via module ──────────────────────────────────────────────────
module "gcp_vm" {
  for_each = local.is_gcp ? local.config.vms : {}
  source   = "./modules/vm"

  name           = each.key
  machine_type   = try(each.value.machine_type, local.general.machine_type)
  zone           = local.general.zone
  image          = try(each.value.image, local.general.image)
  disk_size      = try(each.value.disk_size, local.general.disk_size)
  tags           = each.value.tags
  public_ip      = each.value.public_ip
  subnetwork     = google_compute_subnetwork.subnet[0].id
  ssh_user       = local.general.ops_user
  ssh_public_key = file("${pathexpand("~")}/.ssh/id_ed25519.pub")
  ssh_port       = local.general.ssh_port
}

# ── Outputs ─────────────────────────────────────────────────────────────
output "vm_ips" {
  description = "Internal and external IPs of all VMs"
  value = local.is_gcp ? {
    for name, vm in module.gcp_vm : name => {
      internal_ip = vm.internal_ip
      external_ip = vm.external_ip
    }
  } : {}
}
