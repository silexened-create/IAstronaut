FROM php:8.2-apache

# Habilitar el módulo de reescritura de Apache (para el .htaccess)
RUN a2enmod headers rewrite

# Copiar el contenido de tu carpeta local al servidor
COPY . /var/www/html/

# Exponer el puerto 80
EXPOSE 80
