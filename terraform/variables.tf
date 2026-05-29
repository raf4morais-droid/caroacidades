variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "sigweb-tupancireta"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-east1"
}

variable "environment" {
  description = "Ambiente (dev, staging, prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Ambiente deve ser dev, staging ou prod."
  }
}

variable "db_password" {
  description = "Senha do PostgreSQL (Cloud SQL)"
  type        = string
  sensitive   = true
}

variable "firebase_service_account" {
  description = "Firebase Admin SDK service account JSON (base64)"
  type        = string
  sensitive   = true
}
