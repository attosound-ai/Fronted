/**
 * The Live Activity shown while a post goes out (Instagram style): the
 * post's thumbnail and a progress ring in the Dynamic Island, the same with
 * the words on the Lock Screen. Started and updated by the app through the
 * atto-live-activity module; the attributes type is duplicated there.
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'widget',
  name: 'AttoPublishActivity',
  displayName: 'ATTO',
  bundleIdentifier: '.publishactivity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
