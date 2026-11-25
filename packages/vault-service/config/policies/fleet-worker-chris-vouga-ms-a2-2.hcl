path "secret/data/personal/prd" {
  capabilities = ["read"]
}

path "secret/data/personal/workers/chris-vouga-ms-a2-2" {
  capabilities = ["read"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}
