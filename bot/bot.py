import discord
from discord.ext import commands
from services.config import AUTO_ROLE_SYNC_ON_JOIN, TOKEN

intents = discord.Intents.default()
if AUTO_ROLE_SYNC_ON_JOIN:
    intents.members = True
bot = commands.Bot(intents=intents, command_prefix='/') 

def setup():
    bot.load_extension("commands.verify")
    bot.load_extension("commands.change")
    bot.load_extension("commands.update")
    bot.load_extension("commands.banquea.quiz_commands")
    bot.load_extension("services.member_sync")

if __name__ == "__main__":
    if not TOKEN:
        raise RuntimeError("Falta DISCORD_BOT_TOKEN. Agrégalo en .env o en las variables de entorno.")
    setup()
    bot.run(TOKEN)


