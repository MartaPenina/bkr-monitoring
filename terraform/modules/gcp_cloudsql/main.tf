resource "google_sql_database_instance" "postgres" {
  count            = var.config.general.cloud == "gcp" ? 1 : 0
  name             = "bkr-postgres"
  database_version = "POSTGRES_16"
  region           = var.config.locations[var.config.general.location].gcp.region

  settings {
    tier = "db-f1-micro"

    backup_configuration {
      enabled = true
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_id
    }
  }

  deletion_protection = false
}

resource "google_sql_database" "main" {
  count    = var.config.general.cloud == "gcp" ? 1 : 0
  name     = "bkr"
  instance = google_sql_database_instance.postgres[0].name
}

resource "google_sql_user" "main" {
  count    = var.config.general.cloud == "gcp" ? 1 : 0
  name     = "bkr"
  instance = google_sql_database_instance.postgres[0].name
  password = var.config.general.db_password
}