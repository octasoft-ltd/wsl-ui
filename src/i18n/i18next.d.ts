import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    // Disable strict key checking to allow cross-namespace references like t('common:key')
    // and dynamic keys like t(`tabs.${id}`)
    defaultNS: "common";
  }
}
