import discord
from database.repository import get_users_by_discord_id
from services.config import AUTO_ROLE_SYNC_ON_JOIN


async def sync_member_roles(member):
    user_rows = get_users_by_discord_id(member.id)
    if not user_rows:
        return []

    assigned_roles = []
    for row in user_rows:
        course_name = row["course"]
        if not course_name:
            continue

        role = discord.utils.get(member.guild.roles, name=course_name)
        if not role:
            continue

        try:
            await member.add_roles(role)
            assigned_roles.append(course_name)
        except Exception:
            continue

    return sorted(set(assigned_roles))


def setup(bot):
    @bot.event
    async def on_member_join(member):
        if not AUTO_ROLE_SYNC_ON_JOIN:
            return

        assigned_roles = await sync_member_roles(member)
        if assigned_roles:
            print(f"Auto verificacion para {member}: {', '.join(assigned_roles)}")

    @bot.slash_command(
        name="sincronizar_mis_roles",
        description="Sincroniza tus roles desde la base de datos del aula virtual",
    )
    async def sync_my_roles(ctx):
        if ctx.guild is None:
            await ctx.respond("Este comando solo se puede usar en un servidor.", ephemeral=True)
            return

        assigned_roles = await sync_member_roles(ctx.author)
        if assigned_roles:
            await ctx.respond(f"Roles sincronizados: {', '.join(assigned_roles)}.", ephemeral=True)
        else:
            await ctx.respond(
                "No encontre cursos vinculados a tu cuenta de Discord en la base de datos.",
                ephemeral=True,
            )
