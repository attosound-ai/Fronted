import enCommon from '@/locales/en/common.json';
import enAuth from '@/locales/en/auth.json';
import enRegistration from '@/locales/en/registration.json';
import enProfile from '@/locales/en/profile.json';
import enMessages from '@/locales/en/messages.json';
import enProjects from '@/locales/en/projects.json';
import enCalls from '@/locales/en/calls.json';
import enSubscription from '@/locales/en/subscription.json';
import enFeed from '@/locales/en/feed.json';
import enValidation from '@/locales/en/validation.json';
import enNotifications from '@/locales/en/notifications.json';

import esCommon from '@/locales/es/common.json';
import esAuth from '@/locales/es/auth.json';
import esRegistration from '@/locales/es/registration.json';
import esProfile from '@/locales/es/profile.json';
import esMessages from '@/locales/es/messages.json';
import esProjects from '@/locales/es/projects.json';
import esCalls from '@/locales/es/calls.json';
import esSubscription from '@/locales/es/subscription.json';
import esFeed from '@/locales/es/feed.json';
import esValidation from '@/locales/es/validation.json';
import esNotifications from '@/locales/es/notifications.json';

import ptBRCommon from '@/locales/pt-BR/common.json';
import ptBRAuth from '@/locales/pt-BR/auth.json';
import ptBRRegistration from '@/locales/pt-BR/registration.json';
import ptBRProfile from '@/locales/pt-BR/profile.json';
import ptBRMessages from '@/locales/pt-BR/messages.json';
import ptBRProjects from '@/locales/pt-BR/projects.json';
import ptBRCalls from '@/locales/pt-BR/calls.json';
import ptBRSubscription from '@/locales/pt-BR/subscription.json';
import ptBRFeed from '@/locales/pt-BR/feed.json';
import ptBRValidation from '@/locales/pt-BR/validation.json';
import ptBRNotifications from '@/locales/pt-BR/notifications.json';

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    registration: enRegistration,
    profile: enProfile,
    messages: enMessages,
    projects: enProjects,
    calls: enCalls,
    subscription: enSubscription,
    feed: enFeed,
    validation: enValidation,
    notifications: enNotifications,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    registration: esRegistration,
    profile: esProfile,
    messages: esMessages,
    projects: esProjects,
    calls: esCalls,
    subscription: esSubscription,
    feed: esFeed,
    validation: esValidation,
    notifications: esNotifications,
  },
  'pt-BR': {
    common: ptBRCommon,
    auth: ptBRAuth,
    registration: ptBRRegistration,
    profile: ptBRProfile,
    messages: ptBRMessages,
    projects: ptBRProjects,
    calls: ptBRCalls,
    subscription: ptBRSubscription,
    feed: ptBRFeed,
    validation: ptBRValidation,
    notifications: ptBRNotifications,
  },
} as const;
