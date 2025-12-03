// ChatWidget.js
// Floating AI chatbot widget with multilingual support

import React, { useState, useEffect, useRef } from 'react';
import { auth } from './firebaseClient';
import { API_BASE_URL } from './config';
import toast from 'react-hot-toast';
import './ChatWidget.css';

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      loadSuggestions();
      // Send welcome message
      setMessages([{
        role: 'assistant',
        content: '👋 Hi! I\'m your AutoPromote AI Assistant. I speak all 11 South African languages! How can I help you today?\n\nSawubona! (Zulu) | Molo! (Xhosa) | Hallo! (Afrikaans)',
        timestamp: new Date().toISOString()
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSuggestions = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/chat/suggestions`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const sendMessage = async (messageText = inputMessage) => {
    if (!messageText.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId,
          message: messageText
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      
      // Update conversation ID if new
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      // Add bot response
      const botMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to send message');
      
      // Add fallback message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I\'m having trouble responding right now. Please try again in a moment.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion.text);
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: '👋 Chat cleared! How can I help you?',
      timestamp: new Date().toISOString()
    }]);
    setConversationId(null);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Floating button */}
      <button
        className={`chat-widget-button ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open chat"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="chat-widget-panel">
          {/* Header */}
          <div className="chat-widget-header">
            <div className="chat-widget-header-content">
              <div className="chat-widget-avatar">🤖</div>
              <div>
                <h3>AI Assistant</h3>
                <p>All 11 SA Languages</p>
              </div>
            </div>
            <button onClick={clearChat} className="chat-clear-btn" title="Clear chat">
              🔄
            </button>
          </div>

          {/* Messages */}
          <div className="chat-widget-messages">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
              >
                <div className="chat-message-content">
                  {msg.content}
                </div>
                <div className="chat-message-time">
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-message assistant">
                <div className="chat-message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length === 1 && suggestions.length > 0 && (
            <div className="chat-suggestions">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="chat-suggestion-btn"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <span className="suggestion-icon">{suggestion.icon}</span>
                  {suggestion.text}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="chat-widget-input">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Any language)"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!inputMessage.trim() || loading}
              className="chat-send-btn"
            >
              ➤
            </button>
          </div>

          {/* Footer */}
          <div className="chat-widget-footer">
            Powered by OpenAI GPT-4o
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWidget;
