# JadoMovie Telegram Bot

A Telegram bot that collects movie information in exactly 10 content steps, applies a stored visual style, resizes the poster to 1280x640, adds a small bottom-left watermark, and publishes the formatted post to a configured channel/group.

## Main features

- 10-step content wizard:
  1. Poster
  2. Persian title
  3. Year
  4. English title
  5. IMDb rating
  6. Country
  7. Genre
  8. Story summary
  9. Subtitle/Dubbed/Both
  10. Download links
- One-time setup for:
  - Owner/admins
  - Channel ID/username
  - Target group/channel
  - Watermark/logo
  - Premium custom-emoji style sample
- Custom emoji IDs are extracted from a sample Telegram message and reused in the generated caption.
- Poster output is 1280x640 by default.
- Watermark is placed at the bottom-left.
- Admin-only access.
- Public/private group support through Telegram chat IDs.
- PostgreSQL persistence for Render.

## Important Telegram custom emoji note

Telegram Bot API 9.4+ allows bots to use custom emoji in private/group/supergroup messages when the bot owner has Telegram Premium. The bot reads `custom_emoji` entities from the sample message you send to it and stores their IDs. It does not copy the sample message itself.

## Local setup

1. Create a bot with BotFather and get the token.
2. Copy `.env.example` to `.env`.
3. Put your PostgreSQL connection string in `DATABASE_URL`.
4. Set `OWNER_ID` to your Telegram numeric user ID.
5. Run:
   `npm install`
   `npm start`

## Render

The repository includes `render.yaml` and a Dockerfile. Connect the GitHub repository to Render and deploy the Blueprint. Render will create the web service and PostgreSQL database.

Required environment variables:
- BOT_TOKEN
- OWNER_ID

DATABASE_URL is supplied by the Render Blueprint.

## First-time Telegram setup

Send `/start` as the owner.

Then:
- `/setup` — guided setup
- `/admin` — admin menu
- `/new` — start a new movie post
- `/cancel` — cancel current wizard
- `/help` — help

For the style sample, forward/copy a message containing the premium emojis you want the bot to imitate. The bot extracts the custom emoji IDs.

For the target group:
1. Add the bot to the group.
2. Give it permission to send messages/photos.
3. In the group, use `/settarget` as an authorized admin.
4. For a channel, add the bot as an administrator and use `/settarget` there if your bot can receive the command.

## Notes

- The bot accepts links supplied by the administrator. It does not discover or scrape download links.
- If a Telegram message does not expose custom emoji entities to the bot, those emojis cannot be automatically extracted.
- The generated image is kept temporary on the Render instance and removed after sending.
