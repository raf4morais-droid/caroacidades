resource "google_sql_database_instance" "sigweb" {
  name             = "sigweb${local.env_suffix}"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.environment == "prod" ? "db-custom-2-8192" : "db-g1-small"
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_size         = var.environment == "prod" ? 200 : 20
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "prod"
      backup_retention_settings {
        retained_backups = 30
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.sigweb_vpc.id
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }

  deletion_protection = var.environment == "prod"

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_database" "sigweb" {
  name     = "sigweb"
  instance = google_sql_database_instance.sigweb.name
}

resource "google_sql_user" "sigweb" {
  name     = "sigweb"
  instance = google_sql_database_instance.sigweb.name
  password = var.db_password
}
