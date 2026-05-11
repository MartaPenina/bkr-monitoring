resource "google_compute_instance" "vm" {
  for_each = var.config.general.cloud == "gcp" ? var.config.vms : {}
  name         = each.key
  machine_type = var.config.sizes[each.value.size].gcp
  zone         = var.config.locations[var.config.general.location].gcp.zones[each.value.zone]
  tags         = each.value.tags

  boot_disk {
    initialize_params {
      image = var.config.images.ubuntu_2404.gcp
      size  = try(each.value.disk_size, var.config.general.disk_size)
    }
  }

  network_interface {
    subnetwork = var.subnetwork

    dynamic "access_config" {
      for_each = each.value.public_ip ? [1] : []
      content {}
    }
  }

  metadata = {
    ssh-keys       = "${var.config.general.ops_user}:${var.ssh_public_key}"
    startup-script = "#!/bin/bash\ncloud-init status --wait\nsystemctl disable --now ssh.socket\necho 'Port ${var.config.general.ssh_port}' > /etc/ssh/sshd_config.d/custom-port.conf\nsystemctl enable ssh.service\nsystemctl restart ssh.service\n"
  }
}