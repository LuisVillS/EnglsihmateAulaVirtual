import discord
from discord.ui import Button, View

class QuizButton(Button):
    def __init__(self, label, text, explanation, correct_label, correct_text, update_score_callback, update_next_button_callback, question_index):
        super().__init__(style=discord.ButtonStyle.primary, label=label, custom_id=f"quiz_button_{label}_{question_index}")
        self.text = text
        self.explanation = explanation
        self.correct_label = correct_label
        self.correct_text = correct_text
        self.update_score_callback = update_score_callback
        self.update_next_button_callback = update_next_button_callback

    async def callback(self, interaction: discord.Interaction):
        try:
            is_correct = self.label == self.correct_label
            result = "Correcto" if is_correct else "Incorrecto"
            color = discord.Color.green() if is_correct else discord.Color.red()
            embed = discord.Embed(title=result, description=f"{self.explanation}\n\n**Respuesta Correcta: {self.correct_text}**", color=color)
            view = View()
            view.add_item(NextButton(self.update_next_button_callback))
            await interaction.response.edit_message(embed=embed, view=view)
            self.update_score_callback(is_correct)
        except Exception as e:
            await interaction.followup.send("Ocurrió un error al procesar tu respuesta. Intenta nuevamente.", ephemeral=True)

class NextButton(Button):
    def __init__(self, callback):
        super().__init__(style=discord.ButtonStyle.success, label="Siguiente", custom_id="next_question")
        self.callback_func = callback

    async def callback(self, interaction: discord.Interaction):
        try:
            await interaction.response.defer()
            await self.callback_func(interaction)
        except Exception as e:
            await interaction.followup.send("Ocurrió un error al pasar a la siguiente pregunta. Intenta nuevamente.", ephemeral=True)

def create_view(answers, explanation, correct_answer_label, correct_answer_text, update_score_callback, update_next_button_callback, question_index):
    view = View()
    for i, answer in enumerate(answers):
        view.add_item(QuizButton(chr(65 + i), answer, explanation, correct_answer_label, correct_answer_text, update_score_callback, update_next_button_callback, question_index))
    return view
