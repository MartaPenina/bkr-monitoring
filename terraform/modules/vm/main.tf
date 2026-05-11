variable "name"           { type = string }
variable "machine_type"   { type = string }
variable "zone"           { type = string }
variable "image"          { type = string }
variable "disk_size"      { type = number; default = 10 }
variable "tags"           { type = list(string) }
variable "subnetwork"     { type = string }
variable "public_ip"      { type = bool; default = false }
variable "ssh_user"       { type = string }
variable "ssh_public_key" { type = string }
variable "ssh_port"       { type = string }

resource "google_compute_instance" "vm" {
  name         = var.name
  machine_type = var.machine_type
  zone         = var.zone
  tags         = var.tags

  boot_disk {
    initialize_params {
      image = var.image
      size  = var.disk_size
    }
  }

  network_interface {
    subnetwork = var.subnetwork

    dynamic "access_config" {
      for_each = var.public_ip ? [1] : []
      content {}
    }
  }

  metadata = {
    ssh-keys = "${var.ssh_user}:${var.ssh_public_key}"
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash
    if [ -f /etc/ssh/sshd_config.d/custom-port.conf ]; then exit 0; fi
    cloud-init status --wait
    systemctl disable --now ssh.socket 2>/dev/null || true
    echo "Port ${var.ssh_port}" > /etc/ssh/sshd_config.d/custom-port.conf
    systemctl enable ssh.service
    systemctl restart ssh.service
  EOT
}

output "internal_ip" {
  value = google_compute_instance.vm.network_interface[0].network_ip
}

output "external_ip" {
  value = var.public_ip ? google_compute_instance.vm.network_interface[0].access_config[0].nat_ip : null
}

output "name" {
  value = google_compute_instance.vm.name
}
