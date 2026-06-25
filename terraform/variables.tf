variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "caroacidadesinteligentes"
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

variable "web_env_production" {
  description = "Conteúdo do apps/web/.env.production usado pelo build do frontend no Cloud Build"
  type        = string
  sensitive   = true
}

variable "firebase_ci_token" {
  description = "Token gerado por `firebase login:ci` (projeto Firebase caroacidades), usado pelo cloudbuild-web.yaml para deploy no Hosting"
  type        = string
  sensitive   = true
}
