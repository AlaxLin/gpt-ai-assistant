import {
  APP_ENV,
  APP_DEBUG,
  BOT_CALL_SIGN,
  BOT_ACTIVATE_WORDS,
  BOT_DEACTIVATE_WORDS,
} from '../config/index.js';
import {
  PARTICIPANT_AI,
  PARTICIPANT_HUMAN,
  FINISH_REASON_STOP,
  complete,
} from '../services/openai.js';
import {
  EVENT_TYPE_MESSAGE,
  MESSAGE_TYPE_TEXT,
  reply,
} from '../services/line.js';
import Storage from './storage.js';

class Assistant {
  isActivated = true;

  storage = new Storage();

  handleEvents(events = []) {
    return Promise.all(events.map((event) => this.handleEvent(event)));
  }

  async handleEvent({
    replyToken,
    type,
    source,
    message,
  }) {
    if (type !== EVENT_TYPE_MESSAGE) return null;
    if (message.type !== MESSAGE_TYPE_TEXT) return null;
    const prompt = this.storage.getPrompt(source.userId);
    const trimmed = Assistant.trimText(message.text);
    if (!trimmed) return null;
    this.activate(message);
    if (!this.isActivated) return null;
    prompt.write(`${PARTICIPANT_HUMAN}: ${trimmed}？`);
    try {
      const { text } = await this.chat({ prompt: prompt.toString() });
      prompt.write(`${PARTICIPANT_AI}: ${text}`);
      this.deactivate(message);
      this.storage.setPrompt(source.userId, prompt);
      const res = { replyToken, messages: [{ type: message.type, text }] };
      return APP_ENV === 'local' ? res : reply(res);
    } catch (err) {
      console.error(err);
      return reply({ replyToken, messages: [{ type: message.type, text: err.message }] });
    }
  }

  static trimText(text) {
    if (BOT_CALL_SIGN) {
      if (!String(text).startsWith(BOT_CALL_SIGN)) return '';
      return String(text).slice(BOT_CALL_SIGN.length).trim();
    }
    return text;
  }

  activate({ text }) {
    if (!BOT_ACTIVATE_WORDS) return;
    const startWords = String(`${BOT_CALL_SIGN}${BOT_ACTIVATE_WORDS}`).split(',');
    const hasStartWords = startWords.some((word) => String(text).startsWith(word));
    if (!this.isActivated && hasStartWords) {
      this.isActivated = true;
    }
  }

  deactivate({ text }) {
    if (!BOT_DEACTIVATE_WORDS) return;
    const endWords = String(`${BOT_CALL_SIGN}${BOT_DEACTIVATE_WORDS}`).split(',');
    const hasEndWords = endWords.some((word) => String(text).endsWith(word));
    if (this.isActivated && hasEndWords) {
      this.isActivated = false;
    }
  }

  async chat({
    prompt,
    text = '',
  }) {
    const { data } = await complete({ prompt });
    const [choice] = data.choices;
    prompt += choice.text.trim();
    text += choice.text.replace(PARTICIPANT_AI, '').replace(':', '').replace('：', '').trim();
    const res = { prompt, text };
    return choice.finish_reason === FINISH_REASON_STOP ? res : this.chat(res);
  }

  debug() {
    if (APP_DEBUG) console.info(this.storage.toString());
  }
}

export default Assistant;
