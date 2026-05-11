resource "aws_key_pair" "main" {
  count = var.config.general.cloud == "aws" ? 1 : 0

  key_name   = "marta-ops-key"
  public_key = var.ssh_public_key
}

resource "aws_instance" "vm" {
  for_each = var.config.general.cloud == "aws" ? var.config.vms : {}

  ami           = var.config.images.ubuntu_2404.aws
  instance_type = var.config.sizes[each.value.size].aws

  subnet_id = each.value.public_ip ? var.public_subnet_id : var.private_subnet_id

  associate_public_ip_address = each.value.public_ip

  vpc_security_group_ids = concat(
    contains(each.value.tags, "jump-host") ? [var.jump_host_sg_id] : [],
    contains(each.value.tags, "internal") ? [var.internal_sg_id] : [],
    contains(each.value.tags, "web") ? [var.web_sg_id] : []
  )

  key_name = aws_key_pair.main[0].key_name

  root_block_device {
    volume_size = try(each.value.disk_size, var.config.general.disk_size)
  }

  user_data = <<-EOT
    #!/bin/bash
    if [ -f /etc/ssh/sshd_config.d/custom-port.conf ]; then
      exit 0
    fi
    useradd -m -s /bin/bash ${var.config.general.ops_user}
    mkdir -p /home/${var.config.general.ops_user}/.ssh
    cp /home/ubuntu/.ssh/authorized_keys /home/${var.config.general.ops_user}/.ssh/authorized_keys
    chown -R ${var.config.general.ops_user}:${var.config.general.ops_user} /home/${var.config.general.ops_user}/.ssh
    chmod 700 /home/${var.config.general.ops_user}/.ssh
    chmod 600 /home/${var.config.general.ops_user}/.ssh/authorized_keys
    echo "${var.config.general.ops_user} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${var.config.general.ops_user}
    systemctl disable --now ssh.socket
    echo "Port ${var.config.general.ssh_port}" > /etc/ssh/sshd_config.d/custom-port.conf
    systemctl enable ssh.service
    systemctl restart ssh.service
  EOT

  tags = {
    Name = each.key
  }
}