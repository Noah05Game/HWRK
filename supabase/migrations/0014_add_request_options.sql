insert into public.request_options (key, name, description, accent_colour, active, sort_order) values
  ('option-1', 'Sparx Maths', 'Get your Sparx Maths homework done.', '#0A84FF', true, 0),
  ('option-2', 'Sparx Science', 'Get your Sparx Science homework done.', '#30D158', true, 1),
  ('option-3', 'Seneca', 'Get your Seneca homework done.', '#FF9F0A', true, 2),
  ('option-4', 'Sparx Reader', 'Get your Sparx Reader homework done.', '#BF5AF2', true, 3),
  ('tassomai', 'Tassomai', 'Get your Tassomai homework done.', '#FFB38A', true, 4),
  ('languagenut', 'LanguageNut', 'Get your LanguageNut homework done.', '#FFFFFF', true, 5),
  ('educake', 'Educake', 'Get your Educake homework done.', '#BF5AF2', true, 6),
  ('century', 'Century', 'Get your Century homework done.', '#FF453A', true, 7),
  ('maths-watch', 'Maths Watch', 'Get your Maths Watch homework done.', '#0A84FF', true, 8),
  ('carousel', 'Carousel', 'Get your Carousel homework done.', '#40E0D0', true, 9),
  ('drfrost', 'DrFrost', 'Get your DrFrost homework done.', '#FFD60A', true, 10),
  ('sentencebuilders', 'SentenceBuilders', 'Get your SentenceBuilders homework done.', '#FF9F0A', true, 11),
  ('activehub', 'ActiveHub', 'Get your ActiveHub homework done.', '#40E0D0', true, 12)
on conflict (key) do update set name = excluded.name, description = excluded.description,
  accent_colour = excluded.accent_colour, active = true, sort_order = excluded.sort_order;
