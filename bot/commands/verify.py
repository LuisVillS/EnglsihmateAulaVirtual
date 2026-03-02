import discord
from discord.ext import commands
from database.repository import email_is_linked_to_other_discord_user, get_users_by_discord_id, get_users_by_email, link_email_to_discord_user


async def apply_user_roles(member, guild, user_rows):
    roles_assigned = []
    for row in user_rows:
        course_name = row["course"]
        if not course_name:
            continue

        role_obj = discord.utils.get(guild.roles, name=course_name)
        if not role_obj:
            continue

        try:
            await member.add_roles(role_obj)
            roles_assigned.append(course_name)
        except Exception:
            continue

    return sorted(set(roles_assigned))


def setup(bot):
    @bot.slash_command(name="verificar", description="Verifica a los usuarios con roles basados en la base de datos")
    async def verify(ctx, email: str):
        discord_id = str(ctx.author.id)
        guild = ctx.guild

        existing_user_rows = get_users_by_discord_id(discord_id)
        if existing_user_rows:
            roles_assigned = await apply_user_roles(ctx.author, guild, existing_user_rows)
            if roles_assigned:
                await ctx.respond(f"Usted ya estaba verificado. Roles sincronizados: {', '.join(roles_assigned)}.", ephemeral=True)
            else:
                await ctx.respond("Usted ya estaba verificado.", ephemeral=True)
            return

        email_rows = get_users_by_email(email)
        if not email_rows:
            await ctx.respond("El correo no existe.", ephemeral=True)
            return

        if email_is_linked_to_other_discord_user(email, discord_id):
            await ctx.respond(
                "El correo ya ha sido usado, por favor haga click en este Link en caso crea haya sido suplantado: https://bit.ly/3FcgYVL",
                ephemeral=True,
            )
            return

        link_email_to_discord_user(email, discord_id)
        refreshed_rows = get_users_by_discord_id(discord_id) or email_rows
        roles_assigned = await apply_user_roles(ctx.author, guild, refreshed_rows)

        if roles_assigned:
            await ctx.respond(f"Ha sido verificado y asignado a los cursos: {', '.join(roles_assigned)}.", ephemeral=True)
        else:
            await ctx.respond("No se encontraron roles validos para asignar.", ephemeral=True)
