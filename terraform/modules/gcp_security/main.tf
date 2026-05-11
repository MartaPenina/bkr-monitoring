resource "google_compute_firewall" "allow_ssh_external" {
  count = var.config.general.cloud == "gcp" ? 1 : 0

  name    = "allow-ssh-external"
  network = var.vpc_name

  allow {
    protocol = "tcp"
    ports    = [var.config.general.ssh_port]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["jump-host"]
}

resource "google_compute_firewall" "allow_ssh_internal" {
  count = var.config.general.cloud == "gcp" ? 1 : 0

  name    = "allow-ssh-internal"
  network = var.vpc_name

  allow {
    protocol = "tcp"
    ports    = [var.config.general.ssh_port]
  }

  source_tags = ["jump-host"]
  target_tags = ["internal"]
}

resource "google_compute_firewall" "allow_internal" {
  count = var.config.general.cloud == "gcp" ? 1 : 0

  name    = "allow-internal"
  network = var.vpc_name

  allow { protocol = "tcp" }
  allow { protocol = "udp" }
  allow { protocol = "icmp" }

  source_tags = ["internal"]
  target_tags = ["internal"]
}