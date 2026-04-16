"""
OpenAI GPT-4.1 ile LinkedIn postu yazma.
n8n'deki "Post Yazarı" node'unun birebir karşılığı.
"""
import logging
from datetime import datetime
from openai import OpenAI

from config import settings


class PostWriter:
    """GPT-4.1 kullanarak LinkedIn postu yazar."""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def write_weekly_news_post(self, research_content: str) -> str:
        """
        Haftanın AI haberlerinden LinkedIn postu yazar.
        n8n Workflow 1 (LinkedIn Automation) — "Post Yazarı" node'u.
        """
        current_date = datetime.now().isoformat()

        system_message = (
            f"Bu haftanın yapay zeka gelişmeleri: \n{research_content}\n\n"
            f"Date: {current_date}"
        )

        user_message = (
            "Bu haftanın yapay zeka gelişmelerini baz alarak bir LinkedIn postu "
            "oluşturmanı istiyorum. Amacın \"Haftanın en önemli 5 yapay zeka "
            "gelişmelerini\" paylaşmak. Oluşturduğun LinkedIn postunda orta düzey "
            "bir Türkçe kullanmanı istiyorum. Herkesin anlayabileceği bir bilgi "
            "düzeyinde yazmanı istiyorum. Yazının insansı gözükmesini istiyorum.\n\n"
            "Yazı başına maksimum 700 karakteri aşmamaya çalış. YZ kısaltması "
            "yerine AI kısaltmasını kullan.\n\n"
            "Kolay okunabilmesi için başlıklar ve maddeler arasına enter atmayı "
            "unutma. \n\n"
            "Sadece LinkedIn'de paylaşılacak yazıyı çıktı olarak vermeni istiyorum. "
            "Başka hiçbir şey yazmanı istemiyorum."
        )

        return self._generate(system_message, user_message)

    def write_weekly_tip_post(self, research_content: str) -> str:
        """
        AI tavsiyesinden LinkedIn postu yazar.
        n8n Workflow 2 (LinkedIn AI Tips) — "Post Yazarı" node'u.
        """
        current_date = datetime.now().isoformat()

        system_message = (
            f"Kullanman için araştırma: {research_content}\n\n"
            f"Date: {current_date}"
        )

        user_message = (
            "Senin görevin, insanların günlük hayatlarında kullanabilecekleri "
            "değerli fakat herkes tarafından bilinmeyen AI tavsiyelerini LinkedIn "
            "postu aracılığı ile. Amacın, bu tavsiyeyi herhangi bir insanın "
            "kolaylıkla hayatına entegre edebilmesi için önce ona bunun neden "
            "değerli olduğunu (yani hook cümlesini) vermen; ardından nasıl hayatına "
            "çok hızlıca, kolayca ve detaya boğmadan entegre edebileceğini göstermek. "
            "Fakat hızlıca ve detaya boğmadan derken, günlük hayatına entegre "
            "edebilmesi için gerekli bir miktarda bilgi de paylaşmak zorundayız. "
            "Yani \"şunu şöyle yap\" demektense, \"şu uygulama üzerinden şöyle yap\" "
            "demek her zaman daha sağlıklı olacaktır; çünkü insanlar genellikle "
            "nereden, neyi ve nasıl yapacaklarını bilmiyorlar. Böylece çok bilinmeyen "
            "AI tavsiyelerini paylaşmış olacağız. \n\n"
            "Yazı başına maksimum 500 karakteri aşmamaya çalış. YZ kısaltması "
            "yerine AI kısaltmasını kullan.\n\n"
            "Kolay okunabilmesi için başlıklar ve maddeler arasına enter atmayı "
            "unutma. \n\n"
            "Sadece LinkedIn'de paylaşılacak yazıyı çıktı olarak vermeni istiyorum. "
            "Başka hiçbir şey yazmanı istemiyorum."
        )

        return self._generate(system_message, user_message)

    def _generate(self, system_message: str, user_message: str) -> str:
        """GPT-4.1 ile post üretir."""
        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] GPT-4.1 post yazma atlanıyor.")
            return "[DRY-RUN] 🚀 Bu hafta AI dünyasında neler oldu?\n\n1. OpenAI yeni modelini tanıttı\n2. Google Gemini güncellendi\n\n#AI #YapayZeka"

        try:
            response = self.client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.7
            )
            content = response.choices[0].message.content.strip()
            logging.info(f"Post yazıldı ({len(content)} karakter)")
            return content
        except Exception as e:
            logging.error(f"GPT-4.1 post yazma hatası: {e}", exc_info=True)
            raise
