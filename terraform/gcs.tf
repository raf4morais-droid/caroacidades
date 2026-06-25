# Bucket principal — dados geoespaciais (ortomosaico, nuvem de pontos, 360°)
resource "google_storage_bucket" "geodata" {
  name          = "${var.project_id}-geodata${local.env_suffix}"
  location      = var.region
  force_destroy = var.environment != "prod"

  versioning { enabled = true }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "ETag"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 365 * 5 }
  }
}

# Pasta lógica para cada tipo de dado
resource "google_storage_bucket_object" "ortomosaico_placeholder" {
  name    = "ortomosaico/.gitkeep"
  bucket  = google_storage_bucket.geodata.name
  content = "placeholder"
}

resource "google_storage_bucket_object" "potree_placeholder" {
  name    = "potree/.gitkeep"
  bucket  = google_storage_bucket.geodata.name
  content = "placeholder"
}

resource "google_storage_bucket_object" "imageamento360_placeholder" {
  name    = "imageamento360/.gitkeep"
  bucket  = google_storage_bucket.geodata.name
  content = "placeholder"
}

# Leitura pública para tiles e orto-mosaico
resource "google_storage_bucket_iam_member" "geodata_public" {
  bucket = google_storage_bucket.geodata.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Cloud CDN via Load Balancer (para Cache de tiles e 3D)
resource "google_compute_backend_bucket" "geodata_cdn" {
  name        = "sigweb-geodata-cdn${local.env_suffix}"
  bucket_name = google_storage_bucket.geodata.name
  enable_cdn  = true

  cdn_policy {
    cache_mode  = "CACHE_ALL_STATIC"
    default_ttl = 3600
    max_ttl     = 86400
  }
}
