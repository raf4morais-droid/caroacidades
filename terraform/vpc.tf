resource "google_compute_network" "sigweb_vpc" {
  name                    = "sigweb-vpc${local.env_suffix}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "sigweb_subnet" {
  name          = "sigweb-subnet${local.env_suffix}"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.sigweb_vpc.id
}

resource "google_compute_global_address" "private_ip_range" {
  name          = "sigweb-private-ip${local.env_suffix}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.sigweb_vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.sigweb_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

resource "google_vpc_access_connector" "sigweb" {
  name          = "sigweb-connector${local.env_suffix}"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.sigweb_vpc.name
}
