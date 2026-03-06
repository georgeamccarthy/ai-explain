.PHONY: deploy

include .env
export

deploy:
	cd worker && npm install
	@echo "$(OPENAI_API_KEY)" | npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.toml
	@echo "$(PASSPHRASE)" | npx wrangler secret put PASSPHRASE --config worker/wrangler.toml
	cd worker && npx wrangler deploy
