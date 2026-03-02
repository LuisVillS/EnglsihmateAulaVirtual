import asyncio
import discord
from discord.ext import commands
from database.repository import list_linked_users


def setup(bot):
    @bot.slash_command(name="actualizar", description="Actualiza los roles de los usuarios en base a la base de datos")
    @commands.has_permissions(manage_roles=True)
    async def actualizar(ctx, rol: discord.Role = None):
        role_name = rol.name if rol else None
        records = list_linked_users(role_name)
        if not records:
            await ctx.respond(
                f"No se encontraron usuarios{' para el rol: ' + role_name if role_name else ''} en la base de datos.",
                ephemeral=True,
            )
            return

        batch_size = 15
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            for record in batch:
                try:
                    member = await ctx.guild.fetch_member(int(record["discord_id"]))
                except discord.NotFound:
                    member = None

                if not member:
                    print(f"Miembro con ID {record['discord_id']} no encontrado.")
                    continue

                role_obj = discord.utils.get(ctx.guild.roles, name=record["course"])
                if role_obj:
                    await member.add_roles(role_obj)
                    print(f"{member} fue asignado al rol del '{record['course']}'")
                else:
                    print(f"Rol '{record['course']}' no encontrado en el servidor.")

            await asyncio.sleep(1)

        await ctx.respond(f"Roles actualizados{' para el rol ' + role_name if role_name else ''}.", ephemeral=True)
