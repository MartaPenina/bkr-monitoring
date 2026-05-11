resource "google_compute_network" "vpc" {
  count = var.config.general.cloud == "gcp" ? 1 : 0

  name                    = "devops-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  count = var.config.general.cloud == "gcp" ? 1 : 0

  name          = "devops-subnet"
  ip_cidr_range = "10.0.1.0/24"

  region = var.config.locations[var.config.general.location].gcp.region

  network = google_compute_network.vpc[0].id
}