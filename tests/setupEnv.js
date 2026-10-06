// Never use a developer's credentials or production configuration in tests.
Object.assign(process.env, {
    TZ: 'UTC', DEFAULT_LANGUAGE: 'en-US', DELETION_OFFSET: '2', PRICE_OFFSET: '0.75',
    FOOTER_TEXT: 'PDM tests', BOT_TOKEN: 'test-token', BOT_CLIENT_ID: '111111111111111111',
    BOT_SINGLE_SERVER_ID: '222222222222222222', ADMIN_LIST: '["111111111111111111"]',
    ENABLE_DEVELOPER_EVAL: 'false', PTERODACTYL_API_URL: 'https://panel.test',
    PTERODACTYL_API_KEY: 'test-application-key', PTERODACTYL_ACCOUNT_API_KEY: 'test-client-key'
});
