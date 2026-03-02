import discord
from discord.ext import commands
from database.repository import get_users_by_email, link_email_to_discord_user


def setup(bot):
    @bot.slash_command(name="cambiar", description="Cambia el ID de discord de un usuario a otro")
    @commands.has_permissions(manage_roles=True)
    async def update(ctx, email: str, user: discord.User):
        email_records = get_users_by_email(email)
        if not email_records:
            await ctx.respond("No se encontro ningun usuario con ese correo.", ephemeral=True)
            return

        previous_discord_id = email_records[0]["discord_id"]
        if previous_discord_id:
            try:
                previous_user = await ctx.guild.fetch_member(int(previous_discord_id))
            except discord.NotFound:
                previous_user = None
            if previous_user:
                for record in email_records:
                    role = discord.utils.get(ctx.guild.roles, name=record["course"])
                    if role:
                        await previous_user.remove_roles(role)

        link_email_to_discord_user(email, user.id)

        new_user = await ctx.guild.fetch_member(user.id)
        roles_assigned = []
        for record in email_records:
            role = discord.utils.get(ctx.guild.roles, name=record["course"])
            if role:
                await new_user.add_roles(role)
                roles_assigned.append(record["course"])

        if roles_assigned:
            await ctx.respond(
                f"Usuario actualizado con exito y roles {', '.join(sorted(set(roles_assigned)))} asignados a {new_user.display_name}.",
                ephemeral=True,
            )
        else:
            await ctx.respond("No se encontraron roles validos para asignar.", ephemeral=True)
