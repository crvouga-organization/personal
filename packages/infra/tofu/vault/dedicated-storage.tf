resource "vault_kv_secret_v2" "dedicated_storage" {
  for_each = local.config.dedicated_object_stores
  mount    = vault_mount.secret.path
  name     = each.value.credential_path
  data_json = jsonencode({
    S3_BUCKET            = each.value.bucket
    S3_ENDPOINT          = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
    S3_REGION            = "auto"
    S3_ACCESS_KEY_ID     = data.terraform_remote_state.foundation.outputs.dedicated_object_store_keys[each.key].access_key_id
    S3_SECRET_ACCESS_KEY = data.terraform_remote_state.foundation.outputs.dedicated_object_store_keys[each.key].secret_access_key
  })
  lifecycle { prevent_destroy = true }
}
