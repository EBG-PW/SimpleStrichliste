const featureDefinitions = {
    foodorders: {
        translationKeyBase: 'Admin.FeatureCards.foodorders',
        settingsTranslationKeyBase: 'AdminSettings.Features.foodorders',
        href: '/admin/foodorders',
    },
};

const getEnabledFeatures = (featureSettings) => {
    return Object.entries(featureSettings).reduce((enabledFeatures, [featureName, enabled]) => {
        if (enabled) {
            enabledFeatures[featureName] = true;
        }
        return enabledFeatures;
    }, {});
};

const getEnabledFeatureDefinitions = (featureSettings) => {
    return Object.entries(featureDefinitions).reduce((enabledFeatureDefinitions, [featureName, definition]) => {
        if (featureSettings[featureName] === true) {
            enabledFeatureDefinitions[featureName] = definition;
        }
        return enabledFeatureDefinitions;
    }, {});
};

module.exports = {
    featureDefinitions,
    getEnabledFeatures,
    getEnabledFeatureDefinitions,
};
