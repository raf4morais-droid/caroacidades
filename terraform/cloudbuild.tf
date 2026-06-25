data "google_project" "current" {
  project_id = var.project_id
}

locals {
  cloudbuild_sa = "${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# Trigger: push em main → build/push da imagem da API → deploy no Cloud Run
resource "google_cloudbuild_trigger" "deploy_api_main" {
  name            = "deploy-api-main"
  filename        = "cloudbuild.yaml"
  service_account = "projects/${var.project_id}/serviceAccounts/${local.cloudbuild_sa}"

  github {
    owner = "raf4morais-droid"
    name  = "caroacidades"
    push {
      branch = "^main$"
    }
  }
}

# Trigger: push em main → build do frontend → deploy no Firebase Hosting (projeto caroacidades)
resource "google_cloudbuild_trigger" "deploy_web_main" {
  name            = "deploy-web-main"
  filename        = "cloudbuild-web.yaml"
  service_account = "projects/${var.project_id}/serviceAccounts/${local.cloudbuild_sa}"

  github {
    owner = "raf4morais-droid"
    name  = "caroacidades"
    push {
      branch = "^main$"
    }
  }
}

# Secret: apps/web/.env.production, consumido pelo cloudbuild-web.yaml no build do frontend
resource "google_secret_manager_secret" "web_env_production" {
  secret_id = "web-env-production"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "web_env_production" {
  secret      = google_secret_manager_secret.web_env_production.id
  secret_data = var.web_env_production
}

resource "google_secret_manager_secret_iam_member" "web_env_production_accessor" {
  secret_id = google_secret_manager_secret.web_env_production.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.cloudbuild_sa}"
}

# Secret: token de `firebase login:ci` (projeto Firebase caroacidades), consumido pelo deploy do Hosting
resource "google_secret_manager_secret" "firebase_ci_token" {
  secret_id = "firebase-ci-token"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "firebase_ci_token" {
  secret      = google_secret_manager_secret.firebase_ci_token.id
  secret_data = var.firebase_ci_token
}

resource "google_secret_manager_secret_iam_member" "firebase_ci_token_accessor" {
  secret_id = google_secret_manager_secret.firebase_ci_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.cloudbuild_sa}"
}
