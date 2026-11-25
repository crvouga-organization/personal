resource "cloudflare_r2_bucket" "dedicated" {
  for_each   = local.config.dedicated_object_stores
  account_id = var.cloudflare_account_id
  name       = each.value.bucket
  lifecycle { prevent_destroy = true }
}

resource "cloudflare_account_token" "dedicated_storage" {
  for_each   = cloudflare_r2_bucket.dedicated
  account_id = var.cloudflare_account_id
  name       = each.key
  policies = [{
    effect            = "allow"
    permission_groups = [{ id = one(data.cloudflare_api_token_permission_groups_list.r2.result).id }]
    resources         = jsonencode({ "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${each.value.name}" = "*" })
  }]
}

output "dedicated_object_store_keys" {
  sensitive = true
  value = { for id, token in cloudflare_account_token.dedicated_storage : id => {
    access_key_id = token.id, secret_access_key = sha256(token.value)
  } }
}
