import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      settings: {
        title: 'Settings',
        general: 'General',
        emailNotifications: 'Email Notifications',
        geminiApiKeys: 'Gemini API Keys',
        myDecks: 'My Decks',
        dangerZone: 'Danger Zone',
        language: 'Language',
        selectLanguage: 'Select Language',
        saveStatus: {
          saving: 'Saving...',
          saved: 'Saved'
        },
        emailSection: {
          desc: 'Control how email notifications are sent and received when sharing decks.',
          receiveLabel: 'Receive email when someone shares a deck with me',
          receiveDesc: 'When enabled, you will receive an email notification whenever someone invites you to view their deck.',
          sendLabel: 'Send email to recipients when I share a deck',
          sendDesc: 'When enabled, the people you share with will receive an email (if they also allow it).'
        }
      },
      common: {
        back: 'Back',
        cancel: 'Cancel',
        save: 'Save',
        delete: 'Delete',
        edit: 'Edit',
        add: 'Add'
      }
    }
  },
  vi: {
    translation: {
      settings: {
        title: 'Cài đặt',
        general: 'Chung',
        emailNotifications: 'Thông báo Email',
        geminiApiKeys: 'Khóa API Gemini',
        myDecks: 'Bộ thẻ của tôi',
        dangerZone: 'Vùng nguy hiểm',
        language: 'Ngôn ngữ',
        selectLanguage: 'Chọn ngôn ngữ',
        saveStatus: {
          saving: 'Đang lưu...',
          saved: 'Đã lưu'
        },
        emailSection: {
          desc: 'Kiểm soát cách gửi và nhận thông báo email khi chia sẻ bộ thẻ.',
          receiveLabel: 'Nhận email khi có người chia sẻ bộ thẻ với tôi',
          receiveDesc: 'Khi bật, bạn sẽ nhận được thông báo qua email bất cứ khi nào có người mời bạn xem bộ thẻ của họ.',
          sendLabel: 'Gửi email cho người nhận khi tôi chia sẻ bộ thẻ',
          sendDesc: 'Khi bật, những người bạn chia sẻ cùng sẽ nhận được email (nếu họ cũng cho phép).'
        }
      },
      common: {
        back: 'Quay lại',
        cancel: 'Hủy',
        save: 'Lưu',
        delete: 'Xóa',
        edit: 'Sửa',
        add: 'Thêm'
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
