export APP_HOMA_DB_PASSWORD="$(derive_entropy "${app_entropy_identifier}-postgres-password")"
export APP_HOMA_AUTH_SECRET="$(derive_entropy "${app_entropy_identifier}-auth-secret")"
# HOMA_ENCRYPTION_KEY must be 32 bytes in base64; derive_entropy gives 32 bytes as hex.
homa_key_hex="$(derive_entropy "${app_entropy_identifier}-encryption-key")"
export APP_HOMA_ENCRYPTION_KEY="$(printf '%b' "$(printf '%s' "${homa_key_hex}" | sed 's/../\\x&/g')" | base64 | tr -d '\n')"
