import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models.event import Event
from datetime import datetime, timedelta
import random

def create_test_events():
    db = SessionLocal()
    
    # Очищаем старые тестовые события
    db.query(Event).filter(Event.created_by == 0).delete()
    
    # Тестовые данные
    cities = ["Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Новосибирск"]
    categories = ["концерт", "выставка", "фестиваль", "мастер-класс", "спектакль"]
    
    events_data = [
        {
            "title": "Рок-фестиваль 'Лето'",
            "description": "Крупнейший рок-фестиваль года с участием мировых звезд",
            "category": "фестиваль",
            "city": "Москва",
            "location": "Лужники",
            "price": 2500.0,
            "max_participants": 5000
        },
        {
            "title": "Выставка современного искусства",
            "description": "Работы современных художников со всего мира",
            "category": "выставка", 
            "city": "Санкт-Петербург",
            "location": "Эрмитаж",
            "price": 500.0,
            "max_participants": 200
        },
        {
            "title": "Мастер-класс по йоге",
            "description": "Практика для начинающих и продвинутых",
            "category": "мастер-класс",
            "city": "Казань", 
            "location": "Студия 'Йога-дом'",
            "price": 0.0,
            "max_participants": 30
        },
        {
            "title": "Джазовый концерт",
            "description": "Вечер живой джазовой музыки",
            "category": "концерт",
            "city": "Екатеринбург",
            "location": "Филармония",
            "price": 1200.0,
            "max_participants": 300
        },
        {
            "title": "Фестиваль уличной еды",
            "description": "Лучшая еда со всех уголков мира",
            "category": "фестиваль",
            "city": "Новосибирск",
            "location": "Центральный парк",
            "price": 0.0,
            "max_participants": 1000
        }
    ]
    
    for i, event_data in enumerate(events_data):
        event = Event(
            **event_data,
            address=f"{event_data['location']}, {event_data['city']}",
            date_time=datetime.now() + timedelta(days=i*3 + 1),  # разные даты
            created_by=0,  # системный пользователь
            is_active=True,
            image_url=f"https://picsum.photos/400/300?random={i}",  # случайное изображение
            external_link="https://example.com/tickets"
        )
        db.add(event)
    
    db.commit()
    print(f"Создано {len(events_data)} тестовых событий")
    db.close()

if __name__ == "__main__":
    create_test_events()