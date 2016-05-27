import w20 from '/bower_components/w20/w20';
import { culture, env } from 'w20-core';
import 'content';

culture.setDefaultCulture('fr');
env.set('dev');


w20.start();