locals {
  cloud_sql_connection = "${var.project_id}:${var.region}:sigweb${local.env_suffix}"
}

# API Backend
resource "google_cloud_run_v2_service" "api" {
  name     = "sigweb-api${local.env_suffix}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = var.environment == "prod" ? 2 : 0
      max_instance_count = 50
    }

    vpc_access {
      connector = google_vpc_access_connector.sigweb.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [local.cloud_sql_connection]
      }
    }

    containers {
      image = "gcr.io/${var.project_id}/sigweb-api:latest"

      ports { container_port = 3001 }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "prod" ? "production" : "development"
      }
      env {
        name  = "DATABASE_URL"
        value = "postgresql://sigweb:${var.db_password}@/sigweb?host=/cloudsql/${local.cloud_sql_connection}"
      }
      env {
        name  = "FIREBASE_STORAGE_BUCKET"
        value = "${var.project_id}.appspot.com"
      }
      env {
        name = "FIREBASE_SERVICE_ACCOUNT_JSON"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.firebase_sa.secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }
}

# pg_tileserv (MVT tiles direto do PostGIS)
resource "google_cloud_run_v2_service" "tileserv" {
  name     = "sigweb-tileserv${local.env_suffix}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }

    vpc_access {
      connector = google_vpc_access_connector.sigweb.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [local.cloud_sql_connection]
      }
    }

    containers {
      image = "ghcr.io/crunchydata/pg_tileserv:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "DATABASE_URL"
        value = "postgresql://sigweb:${var.db_password}@/sigweb?host=/cloudsql/${local.cloud_sql_connection}"
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }
}

# Secret Manager — Firebase Service Account
resource "google_secret_manager_secret" "firebase_sa" {
  secret_id = "firebase-service-account${local.env_suffix}"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
}

resource "google_secret_manager_secret_version" "firebase_sa" {
  secret      = google_secret_manager_secret.firebase_sa.id
  secret_data = var.firebase_service_account
}

# IAM — Cloud Run sem auth (Firebase valida os tokens)
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "tileserv_public" {
  name     = google_cloud_run_v2_service.tileserv.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
