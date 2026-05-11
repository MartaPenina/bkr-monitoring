terraform {
  backend "gcs" {
    bucket = "sixth-hawk-496014-a4-bkr-tf-state"
    prefix = "terraform/state"
  }
}
