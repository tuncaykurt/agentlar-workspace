"""
Base Agent — Ortak Agent arayüzü
=================================
Tüm uzmanlaşmış agentlar bu base class'tan türer.
"""

from abc import ABC, abstractmethod


class BaseAgent(ABC):
    """
    Her email agent'ı bu arayüzü implement eder.
    """
    
    def __init__(self, name):
        self.name = name
        self.stats = {"drafted": 0, "read_only": 0}
    
    @abstractmethod
    def handle(self, ctx):
        """
        Email'i işle ve uygun aksiyonu al.
        
        Args:
            ctx: EmailContext nesnesi (sender, body, thread_id vb.)
        
        Returns:
            {"action": "drafted" | "read_only", "details": str}
        """
        pass
    
    def get_stats(self):
        return {f"{self.name}_{k}": v for k, v in self.stats.items()}
