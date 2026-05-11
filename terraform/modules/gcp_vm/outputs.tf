output "jump_host_external_ip" {
  value = try(google_compute_instance.vm["jump-host"].network_interface[0].access_config[0].nat_ip, null)
}

output "jump_host_internal_ip" {
  value = try(google_compute_instance.vm["jump-host"].network_interface[0].network_ip, null)
}

output "internal_vm_ips" {
  value = {
    for name, vm in google_compute_instance.vm : name => vm.network_interface[0].network_ip
    if name != "jump-host"
  }
}