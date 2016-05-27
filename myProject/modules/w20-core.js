var w20Core = w20.fragment('w20-core');

var w20CoreCulture = w20Core.module('culture', {
    path: '{w20-core}/modules/culture',
    config: {
        defaultCulture: 'en'
    }
});

var w20CoreEnv = w20Core.module('env', {
    path: '{w20-core}/modules/env'
});

export let culture = {
    /**
     * Sets the default culture of the application.
     * @param defaultCulture The IETF code of the default culture.
     */
    setDefaultCulture: function (defaultCulture) {
        w20CoreCulture.config({
            defaultCulture: defaultCulture
        });
        return this;
    }
};

export let env = {
    /**
     * Sets the application environment.
     * @param env the environment.
     */
    set: function (env) {
        w20CoreEnv.config({
            env: env
        })
    }
};
